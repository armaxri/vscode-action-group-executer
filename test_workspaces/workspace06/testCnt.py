#!/usr/bin/env python3

import sys
import time
import argparse

def printAndFlush(msg):
    print(msg)
    sys.stdout.flush()


def run_counting(args):
    printAndFlush(f"Hello from test stript instance '{args.name}'!")
    for i in range(args.count):
        printAndFlush(f"Instance '{args.name}' counted to '{i}'.")
        time.sleep(1)


def main():
    parser = argparse.ArgumentParser(description="Simple counter test script.")
    parser.add_argument(
        "-c", "--count", type=int, help="Number to count to."
    )
    parser.add_argument(
        "-n", "--name", type=str, help="Name to display."
    )

    args = parser.parse_args()
    run_counting(args)


if __name__ == "__main__":
    main()
