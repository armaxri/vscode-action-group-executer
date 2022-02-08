#!/usr/bin/env python3

import sys
import time

print("Hello from stdout!")
sys.stdout.flush()
print("Hello from stderr!", file=sys.stderr)
sys.stderr.flush()

time.sleep(3)

print("Bye from stdout!")
sys.stdout.flush()
print("Bye from stderr!", file=sys.stderr)
sys.stderr.flush()
