#!/bin/sh

END=$1
# Welcome message.
echo "Hello from test stript instance '$2'!"
for i in $(seq 1 $END); do echo "Instance '$2' counted to '$i'." && sleep 1; done
