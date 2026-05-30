// Screenshot-readable benchmark entrypoint. The banner is imported FIRST so
// its DOM stubs + fetch interception are installed before main.ts runs its
// module-scope getElementById / addEventListener / final /results POST.
import './bench-banner.js';
import './main.js';
