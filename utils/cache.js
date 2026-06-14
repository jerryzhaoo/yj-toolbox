/**
 * 本地缓存工具（带 TTL 过期）
 * 用于减少云数据库重复查询，降低调用次数
 */
const PREFIX = 'cache_'

function getKey(key) {
  return PREFIX + key
}

/**
 * 读取缓存，过期返回 null
 * ttl 为 0 表示永不过期
 */
function get(key) {
  try {
    const raw = wx.getStorageSync(getKey(key))
    if (!raw) return null
    // expiry 为 0 或不存在表示永不过期
    if (raw.expiry && Date.now() > raw.expiry) {
      wx.removeStorageSync(getKey(key))
      return null
    }
    return raw.value
  } catch (e) {
    return null
  }
}

/**
 * 写入缓存，ttlMs 单位毫秒
 * ttlMs = 0 表示永不过期，ttlMs > 0 表示过期毫秒数
 */
function set(key, value, ttlMs = 5 * 60 * 1000) {
  try {
    wx.setStorageSync(getKey(key), {
      value,
      expiry: ttlMs > 0 ? Date.now() + ttlMs : 0,
    })
  } catch (e) {
    // 存储满时不处理
  }
}

/**
 * 清除指定缓存
 */
function remove(key) {
  try {
    wx.removeStorageSync(getKey(key))
  } catch (e) {}
}

/**
 * 缓存包装函数：优先读缓存，缓存未命中则调用 fetchFn 获取并缓存
 */
async function withCache(key, fetchFn, ttlMs = 5 * 60 * 1000) {
  const cached = get(key)
  if (cached !== null) return cached
  const result = await fetchFn()
  set(key, result, ttlMs)
  return result
}

module.exports = { get, set, remove, withCache }
