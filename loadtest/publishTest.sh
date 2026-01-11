#!/bin/sh

autocannon -a 3000 -c 500 -m POST -i ./loadtest/data.json \
  -H "Content-Type:application/json" \
  -H "x-api-key: c8567649-9d92-4564-b4b0-59b86586e786" \
  https://simple-queue.tiagorosadacost.workers.dev/publish?url=https://lively-thunder-65.webhook.cool
  # http://localhost:8787/publish?url=https://lively-thunder-65.webhook.cool
