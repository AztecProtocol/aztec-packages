#pragma once
// WASM Tracy stub - Tracy profiling is not supported in WASM builds

// Basic Tracy macros that are no-ops for WASM
#define ZoneScoped
#define ZoneScopedN(name)
#define ZoneText(txt, size)
#define ZoneValue(value)
#define ZoneName(txt, size)
#define ZoneColor(color)
#define ZoneTransient(zone, active)

#define FrameMark
#define FrameMarkNamed(name)
#define FrameMarkStart(name)
#define FrameMarkEnd(name)

#define TracyPlot(name, val)
#define TracyMessage(txt, size)
#define TracyMessageL(txt)
#define TracyMessageC(txt, size, color)
#define TracyMessageLC(txt, color)

#define TracyAlloc(ptr, size)
#define TracyFree(ptr)
#define TracySecureAlloc(ptr, size)
#define TracySecureFree(ptr)

#define TracyAllocN(ptr, size, name)
#define TracyFreeN(ptr, name)
#define TracySecureAllocN(ptr, size, name)
#define TracySecureFreeN(ptr, name)

#define TracyLockable(type, varname) type varname
#define TracyLockableN(type, varname, desc) type varname
#define TracySharedLockable(type, varname) type varname
#define TracySharedLockableN(type, varname, desc) type varname

#define LockableBase(type) type
#define SharedLockableBase(type) type

#define LockMark(varname)
#define LockableName(varname, txt, size)

// Tracy allocation tracking functions - stubs
#define TracyAllocS(ptr, size, depth)
#define TracyFreeS(ptr, depth)
#define TracySecureAllocS(ptr, size, depth)
#define TracySecureFreeS(ptr, depth)

// C API function stubs
extern "C" {
inline void ___tracy_init_thread(void) {}
inline void* ___tracy_alloc_srcloc(uint32_t, const char*, const char*, const char*, size_t)
{
    return nullptr;
}
inline void* ___tracy_alloc_srcloc_name(uint32_t, const char*, const char*, const char*, size_t, const char*, size_t)
{
    return nullptr;
}
inline void ___tracy_free_srcloc(void*) {}
inline uint64_t ___tracy_alloc_srcloc_name_2(
    uint32_t, const char*, const char*, const char*, size_t, const char*, size_t)
{
    return 0;
}
}