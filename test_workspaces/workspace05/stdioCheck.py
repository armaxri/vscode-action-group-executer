#!/usr/bin/env python3

import sys
import time

print("Hello from stdout!")
print("Hello from stderr!", file=sys.stderr)

time.sleep(3)

print("Bye from stdout!")
print("Bye from stderr!", file=sys.stderr)
