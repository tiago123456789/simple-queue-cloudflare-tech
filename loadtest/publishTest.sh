#!/bin/sh

autocannon -a 5000 -c 600 -m POST -i ./loadtest/data.json \
  -H "Content-Type:application/json" \
  -H "x-api-key: api_key_here" \
  http://localhost:8787/publish?url=https://lively-thunder-65.webhook.cool 


