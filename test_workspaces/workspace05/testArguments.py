#!/usr/bin/env python3

import sys

print("Hello! The following arguments were passed!")
sys.stdout.flush()

i = 0
for arg in sys.argv:
    print(f"{i}: {arg}")
    sys.stdout.flush()
    i = i + 1

print("All arguments printed.")
sys.stdout.flush()
