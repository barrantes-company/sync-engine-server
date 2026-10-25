"use strict";
// Only suppress startup address diagnostics in the signal-test child. Networking/auth stay real.
require("node:os").networkInterfaces = () => ({});
