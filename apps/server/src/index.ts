import { Server } from "@hocuspocus/server";

const server = Server.configure({
  port: 1234,

  async onConnect(data) {
    console.log(
      `[${new Date().toISOString()}] + ${data.documentName} (${data.clientsCount} client${data.clientsCount === 1 ? "" : "s"})`
    );
  },

  async onDisconnect(data) {
    console.log(
      `[${new Date().toISOString()}] - ${data.documentName} (${data.clientsCount} client${data.clientsCount === 1 ? "" : "s"})`
    );
  },
});

server.listen();
console.log("Inscribe collaboration server listening on ws://localhost:1234");
console.log("Open the demo in two tabs with ?room=<name> to collaborate.");
