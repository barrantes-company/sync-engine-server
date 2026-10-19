"use strict";
// Only suppress startup address diagnostics in the signal-test child. Some
// sandbox kernels reject uv_interface_addresses; networking/auth stay real.
require("node:os").networkInterfaces = () => ({});
