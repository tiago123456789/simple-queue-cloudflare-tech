#!/bin/sh

autocannon -a 5000 -c 200 -m POST -i ./loadtest/data.json \
  -H "Content-Type:application/json" \
  -H "x-api-key: value_here" \
  http://localhost:8787/publish
