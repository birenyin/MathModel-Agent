const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("mathModelAgent", {
  apiBase: "http://127.0.0.1:18089"
});

