local key = KEYS[1]
local offset = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local property = ARGV[3]
local pattern = ARGV[4]
local result = {}
local skip = 0
local seen_runs = {}
local run_count = 0

local patterns = {}
for pat in string.gmatch(pattern, '([^,]+)') do
  table.insert(patterns, pat)
end

local function matches_any(str, patterns)
  for _, pat in ipairs(patterns) do
    if string.find(str, pat) then return true end
  end
  return false
end

local allMembers = redis.call('ZREVRANGE', key, 0, -1)
for _, member in ipairs(allMembers) do
  local ok, parsed = pcall(cjson.decode, member)
  if ok then
    local include = true
    if property and pattern and parsed[property] and not matches_any(parsed[property], patterns) then
      include = false
    end
    if include then
      if skip >= offset then
        local run_id = parsed["run_id"] or "unknown"
        if not seen_runs[run_id] then
          seen_runs[run_id] = true
          run_count = run_count + 1
          if run_count > limit then break end
        end
        -- Patch status via string replace to avoid cjson number truncation.
        if parsed["status"] == "RUNNING" then
          -- Extract timestamp from raw JSON string to avoid Lua double truncation.
          local ts_str = string.match(member, '"timestamp":(%d+)')
          local hb_key = "hb-" .. (ts_str or "0")
          if redis.call("EXISTS", hb_key) == 0 then
            local patched = string.gsub(member, '"status":"RUNNING"', '"status":"INACTIVE"', 1)
            table.insert(result, patched)
          else
            table.insert(result, member)
          end
        else
          table.insert(result, member)
        end
      else
        skip = skip + 1
      end
    end
  end
end

return result
