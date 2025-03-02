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

if not property or property == "" or not pattern or pattern == "" then
  local allMembers = redis.call('ZREVRANGE', key, offset, offset + limit)
  for _, member in ipairs(allMembers) do
    local ok, parsed = pcall(cjson.decode, member)
    if ok then
      table.insert(result, parsed)
    end
  end
else
  local allMembers = redis.call('ZREVRANGE', key, 0, -1)
  for _, member in ipairs(allMembers) do
    local ok, parsed = pcall(cjson.decode, member)
    if ok and parsed[property] and string.find(parsed[property], pattern) then
      table.insert(result, parsed)
      if #result >= limit then break end
    end
  end
end

for i, member in ipairs(result) do
  if member["status"] == "RUNNING" then
    local ts = member["timestamp"]
    local hb_key = "hb-" .. tostring(ts)
    if redis.call("EXISTS", hb_key) == 0 then
      member["status"] = "INACTIVE"
    end
  end
end

local results = {}
for i, member in ipairs(result) do
  local json = cjson.encode(member)
  table.insert(results, json)
end

return results
