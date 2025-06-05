import { mpvManager } from "./mpv-manager"
import type { RemoteCommand } from "./types"

Bun.serve({
  routes: {
    "/api/status": () => Response.json({ status: "OK", timestamp: new Date() }),

    "/api/instances": {
      GET: () => {
        const instances = mpvManager.getAllInstances().map((i) => ({
          id: i.id,
          status: i.status,
          lastSeen: i.lastSeen,
        }))
        return Response.json(instances)
      },

      POST: async (req) => {
        try {
          const body = await req.json()
          const mediaFile = body?.mediaFile
          const instanceId = await mpvManager.createInstance(mediaFile)
          return Response.json({
            instanceId,
            message: "MPV instance created successfully",
          })
        } catch (error) {
          return Response.json(
            {
              error: `Failed to create instance: ${error}`,
            },
            { status: 500 }
          )
        }
      },
    },
    "/api/instances/:id": {
      GET: (req) => {
        const instance = mpvManager.getInstance(req.params.id)
        if (!instance) {
          return Response.json({ error: "Instance not found" }, { status: 404 })
        }
        return Response.json(instance)
      },

      DELETE: async (req) => {
        try {
          await mpvManager.stopInstance(req.params.id)
          return Response.json({ message: "Instance stopped" })
        } catch (error) {
          return Response.json(
            {
              error: `Failed to stop instance: ${error}`,
            },
            { status: 500 }
          )
        }
      },
    },
    "/api/instances/:id/command": {
      POST: async (req) => {
        try {
          const command = (await req.json()) as RemoteCommand
          const result = await mpvManager.executeRemoteCommand(
            req.params.id,
            command
          )
          return Response.json(result)
        } catch (error) {
          return Response.json(
            {
              error: `Failed to execute command: ${error}`,
            },
            { status: 500 }
          )
        }
      },
    },
  },

  fetch(req) {
    return new Response("Not Found", { status: 404 })
  },
})

console.log("MPV Remote Control Server running on http://localhost:3000")

// fetch("http://localhost:3000/api/instances", {
//   method: "POST",
//   headers: {
//     "Content-Type": "application/json",
//   },
//   body: JSON.stringify({
//     mediaFile:
//       "D:\\mpv-play\\sample.mp4",
//   }),
// })

fetch("http://localhost:3000/api/instances", {
  method: "GET",
  headers: {
    "Content-Type": "application/json",
  },
})
