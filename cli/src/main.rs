use clap::{Parser, Subcommand};
use anyhow::{anyhow, Context, Result};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::UnixStream;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::Duration;

const DEFAULT_DAEMON_SCRIPT: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../daemon/src/index.ts");

#[derive(Parser)]
#[command(name = "agent-surf", about = "Fast AI-friendly browser CLI")]
struct Cli {
    #[command(subcommand)]
    command: Commands,

    #[arg(long, default_value = "json", help = "Output format: json | toon | plain")]
    format: String,

    #[arg(long, help = "Named session — keeps cookies and login state")]
    profile: Option<String>,
}

#[derive(Subcommand)]
enum Commands {
    /// Install browser engines (run once before first use)
    Install,
    /// Navigate to a URL
    Open { url: String },
    /// Snapshot the current page as structured, AI-digestible content
    Snapshot,
    /// Click an element by ref (e.g. e3) or visible text
    Click { target: String },
    /// Type text into an element by ref or label
    Type { target: String, text: String },
    /// Stop the background daemon
    Stop,
}

fn get_socket_path() -> Result<PathBuf> {
    let home = std::env::var("HOME").context("HOME not set")?;
    Ok(PathBuf::from(home).join(".agent-surf").join("daemon.sock"))
}

async fn is_daemon_running(socket_path: &PathBuf) -> bool {
    UnixStream::connect(socket_path).await.is_ok()
}

async fn start_daemon(socket_path: &PathBuf) -> Result<()> {
    let daemon_script = std::env::var("AGENT_SURF_DAEMON")
        .unwrap_or_else(|_| DEFAULT_DAEMON_SCRIPT.to_string());

    let mut child = tokio::process::Command::new("npx")
        .arg("ts-node")
        .arg(&daemon_script)
        .arg("--socket")
        .arg(socket_path)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::inherit())
        .spawn()
        .context("Failed to start daemon")?;

    let stdout = child.stdout.take().context("No stdout from daemon")?;
    let mut reader = BufReader::new(stdout).lines();

    tokio::time::timeout(Duration::from_secs(30), async {
        while let Some(line) = reader.next_line().await? {
            if line.trim() == "READY" {
                return Ok::<(), anyhow::Error>(());
            }
        }
        Err(anyhow!("Daemon exited without sending READY"))
    })
    .await
    .context("Timed out waiting for daemon to start")??;

    // Let the daemon run in background; reap it silently when it exits
    tokio::spawn(async move { let _ = child.wait().await; });

    Ok(())
}

async fn send_command(socket_path: &PathBuf, cmd_json: &str) -> Result<String> {
    let stream = UnixStream::connect(socket_path)
        .await
        .context("Could not connect to daemon socket")?;

    let (reader, mut writer) = stream.into_split();

    writer.write_all(cmd_json.as_bytes()).await?;
    writer.write_all(b"\n").await?;
    writer.shutdown().await?;

    let mut buf_reader = BufReader::new(reader).lines();
    let line = buf_reader
        .next_line()
        .await?
        .context("Daemon closed connection without responding")?;

    Ok(line)
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    let cmd_json = json!({
        "command": match &cli.command {
            Commands::Install       => "install",
            Commands::Open { .. }  => "open",
            Commands::Snapshot     => "snapshot",
            Commands::Click { .. } => "click",
            Commands::Type { .. }  => "type",
            Commands::Stop         => "stop",
        },
        "args": match &cli.command {
            Commands::Open  { url }            => json!({ "url": url }),
            Commands::Click { target }         => json!({ "target": target }),
            Commands::Type  { target, text }   => json!({ "target": target, "text": text }),
            _                                  => json!({}),
        },
        "format": cli.format,
        "profile": cli.profile,
    });

    let socket_path = get_socket_path()?;

    // Handle stop when daemon isn't running
    if matches!(cli.command, Commands::Stop) && !is_daemon_running(&socket_path).await {
        eprintln!("Daemon is not running.");
        return Ok(());
    }

    // Auto-start daemon if not running
    if !is_daemon_running(&socket_path).await {
        start_daemon(&socket_path).await?;
    }

    let line = send_command(&socket_path, &cmd_json.to_string()).await?;

    let response: Value = serde_json::from_str(&line)
        .context("Daemon returned non-JSON response")?;

    if response["ok"].as_bool().unwrap_or(false) {
        match response["data"].as_str() {
            Some(s) => println!("{}", s),
            None    => println!("{}", serde_json::to_string_pretty(&response["data"])?),
        }
    } else {
        let error = response["error"].as_str().unwrap_or("Unknown error");
        eprintln!("error: {}", error);
        std::process::exit(1);
    }

    Ok(())
}
