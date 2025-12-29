#!/bin/sh

autocannon -a 5000 -c 200 -m POST -i ./loadtest/data.json \
  -H "Content-Type:application/json" \
  http://localhost:8787/publish
