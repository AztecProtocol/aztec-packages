-- local key = KEYS[1]
-- local offset = tonumber(ARGV[1])
-- local limit = tonumber(ARGV[2])
-- local property = ARGV[3]
-- local pattern = ARGV[4]

-- if not property or property == "" or not pattern or pattern == "" then
--   return redis.call('ZREVRANGE', key, offset, offset + limit)
-- end

-- local allMembers = redis.call('ZREVRANGE', key, 0, -1)
-- local result = {}
-- for _, member in ipairs(allMembers) do
--   local ok, parsed = pcall(cjson.decode, member)
--   if ok and parsed[property] and string.find(parsed[property], pattern) then
--     table.insert(result, member)
--     if #result >= limit then break end
--   end
-- end
-- return result

local key = KEYS[1]
local offset = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local property = ARGV[3]
local pattern = ARGV[4]
local result = {}
local skip = 0

local allMembers = redis.call('ZREVRANGE', key, 0, -1)
for _, member in ipairs(allMembers) do
  local ok, parsed = pcall(cjson.decode, member)
  if ok then
    if parsed["status"] == "RUNNING" then
      local ts = parsed["timestamp"]
      local hb_key = "hb-" .. tostring(ts)
      if redis.call("EXISTS", hb_key) == 0 then
        parsed["status"] = "INACTIVE"
      end
    end
    local include=true
    if property and pattern and parsed[property] and not string.find(parsed[property], pattern) then
      include=false
    end
    if include then
      if skip >= offset then
        table.insert(result, cjson.encode(parsed))
        if #result >= limit then break end
      else
        skip = skip + 1
      end
    end
  end
end

return result
