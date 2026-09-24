// Startup file for Plesk / Phusion Passenger: Passenger hands the app a socket via the listen() call,
// Next's standalone server.js does the rest.
process.env.HOSTNAME = process.env.HOSTNAME || "0.0.0.0";
process.env.NODE_ENV = "production";
require("./server.js");
