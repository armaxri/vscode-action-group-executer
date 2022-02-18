#!/usr/bin/env python3

import sys

print("Hello! Waiting for input on stdin!")
sys.stdout.flush()

while True:
    for read_line in sys.stdin:
        print(f"input: {read_line}")
        sys.stdout.flush()
        if read_line.startswith("exit"):
            print("Received exit message! Bye!")
            sys.stdout.flush()
            sys.exit()
