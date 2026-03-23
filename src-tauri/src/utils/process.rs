use std::collections::HashSet;
use std::process::Command;
use tokio::process::Child;

#[cfg(unix)]
use nix::sys::signal::{kill, Signal};
#[cfg(unix)]
use nix::unistd::Pid;

#[cfg(unix)]
fn pids_listening_on_tcp_port(port: u16) -> Vec<u32> {
    let Ok(out) = Command::new("lsof")
        .args(["-nP", &format!("-iTCP:{}", port), "-sTCP:LISTEN", "-t"])
        .output()
    else {
        return vec![];
    };
    if !out.status.success() {
        return vec![];
    }
    let my = std::process::id();
    let mut set: HashSet<u32> = HashSet::new();
    for line in String::from_utf8_lossy(&out.stdout).lines() {
        if let Ok(pid) = line.trim().parse::<u32>() {
            if pid > 1 && pid != my {
                set.insert(pid);
            }
        }
    }
    set.into_iter().collect()
}

#[cfg(windows)]
fn tcp_token_local_port(tok: &str, port: u16) -> bool {
    let Some((_, p)) = tok.rsplit_once(':') else {
        return false;
    };
    p == port.to_string()
}

#[cfg(windows)]
fn pids_listening_on_tcp_port(port: u16) -> Vec<u32> {
    let Ok(out) = Command::new("netstat").args(["-ano"]).output() else {
        return vec![];
    };
    let my = std::process::id();
    let mut set: HashSet<u32> = HashSet::new();
    for line in String::from_utf8_lossy(&out.stdout).lines() {
        if !line.to_uppercase().contains("LISTENING") {
            continue;
        }
        if !line.split_whitespace().any(|t| tcp_token_local_port(t, port)) {
            continue;
        }
        if let Some(pid_str) = line.split_whitespace().last() {
            if let Ok(pid) = pid_str.parse::<u32>() {
                if pid > 1 && pid != my {
                    set.insert(pid);
                }
            }
        }
    }
    set.into_iter().collect()
}

#[cfg(unix)]
fn signal_pids(pids: &[u32], signal: Signal) -> Vec<u32> {
    pids.iter()
        .copied()
        .filter(|&pid| kill(Pid::from_raw(pid as i32), signal).is_ok())
        .collect()
}

/// Send SIGTERM to processes listening on the TCP port (Unix); force-kill on Windows.
pub fn terminate_tcp_listeners_on_port(port: u16) {
    #[cfg(unix)]
    {
        let pids = pids_listening_on_tcp_port(port);
        let _ = signal_pids(&pids, Signal::SIGTERM);
    }
    #[cfg(windows)]
    {
        let _ = kill_tcp_listeners_on_port(port);
    }
}

pub fn terminate_tcp_listeners_on_ports(ports: &[u16]) {
    for &p in ports {
        terminate_tcp_listeners_on_port(p);
    }
}

/// Force-kill processes LISTENing on the TCP port (free accidentally held Gateway ports).
pub fn kill_tcp_listeners_on_port(port: u16) -> Result<Vec<u32>, String> {
    let pids = pids_listening_on_tcp_port(port);
    if pids.is_empty() {
        return Err(format!("未找到监听 TCP {} 的进程", port));
    }
    #[cfg(unix)]
    {
        let killed = signal_pids(&pids, Signal::SIGKILL);
        if killed.is_empty() {
            Err("未能结束占用端口的进程（权限不足？）".to_string())
        } else {
            Ok(killed)
        }
    }
    #[cfg(windows)]
    {
        let mut killed = Vec::new();
        for pid in pids {
            let ok = Command::new("taskkill")
                .args(["/F", "/PID", &pid.to_string()])
                .status()
                .map(|s| s.success())
                .unwrap_or(false);
            if ok {
                killed.push(pid);
            }
        }
        if killed.is_empty() {
            Err("未能结束占用端口的进程（权限不足？）".to_string())
        } else {
            Ok(killed)
        }
    }
}

/// Gracefully terminate process (Unix: SIGTERM, Windows: kill).
pub fn terminate_process(child: &mut Child) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        if let Some(pid) = child.id() {
            let pid = Pid::from_raw(pid as i32);
            kill(pid, Signal::SIGTERM)
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;
        }
    }
    
    #[cfg(windows)]
    {
        child.start_kill()?;
    }
    
    Ok(())
}

/// Force-kill child process.
pub fn kill_process(child: &mut Child) -> std::io::Result<()> {
    child.start_kill()
}
