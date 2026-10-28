#!/usr/bin/env python3
"""Runs a login bash in a pseudo-terminal for the web terminal.

stdin -> pty, pty -> stdout. File descriptor 3 takes resize commands, one
"cols rows" per line. Used instead of node-pty, which needs a C++20 compiler
that Ubuntu 20.04 does not ship.
"""
import fcntl
import os
import pty
import select
import signal
import struct
import sys
import termios

CONTROL_FD = 3


def set_size(fd, cols, rows):
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))


def main():
    cols, rows = int(sys.argv[1]), int(sys.argv[2])
    pid, master = pty.fork()
    if pid == 0:
        os.execvp("/bin/bash", ["/bin/bash", "-l"])
    set_size(master, cols, rows)

    watched = [0, master, CONTROL_FD]
    control = b""
    while True:
        try:
            ready, _, _ = select.select(watched, [], [])
        except InterruptedError:
            continue
        if master in ready:
            try:
                data = os.read(master, 65536)
            except OSError:
                break
            if not data:
                break
            os.write(1, data)
        if 0 in ready:
            data = os.read(0, 65536)
            if not data:
                os.kill(pid, signal.SIGHUP)
                break
            os.write(master, data)
        if CONTROL_FD in ready:
            data = os.read(CONTROL_FD, 1024)
            if not data:
                watched.remove(CONTROL_FD)
                continue
            control += data
            while b"\n" in control:
                line, control = control.split(b"\n", 1)
                try:
                    new_cols, new_rows = (int(part) for part in line.split())
                    set_size(master, new_cols, new_rows)
                except ValueError:
                    pass

    _, status = os.waitpid(pid, 0)
    sys.exit(os.WEXITSTATUS(status) if os.WIFEXITED(status) else 1)


if __name__ == "__main__":
    main()
