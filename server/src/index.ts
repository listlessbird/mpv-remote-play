import { MEDIA_SHARES } from "./config"
import { mpvManager } from "./services/mpv-manager"
import type { RemoteCommand } from "./types"
import { MediaShare } from "./services/shares"

const shareService = new MediaShare()
await shareService.init()

Bun.serve({
  routes: {
    "/api/status": () =>
      Response.json({
        status: "OK",
        timestamp: new Date(),
        stats: shareService.getStats(),
      }),

    "/api/instances": {
      GET: async () => {
        const instances = (await mpvManager.getAllInstances()).map((i) => ({
          id: i.id,
          status: i.status,
          lastSeen: i.lastSeen,
          clientName: i.clientName,
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
    "/api/shares": {
      GET: async (req) => {
        const shares = Object.keys(MEDIA_SHARES)
        return Response.json({
          shares,
        })
      },
    },
    "/api/shares/:share": {
      GET: async (req: Request & { params: { share: string } }) => {
        try {
          const result = await shareService.getShareFiles(req.params.share)
          return Response.json({ ...result, path: "/" })
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Unknown error"
          return Response.json({ error: msg }, { status: 404 })
        }
      },
    },
    "/api/shares/:share/:path": async (
      req: Request & { params: { share: string; path: string } }
    ) => {
      try {
        const subPath = req.params.path || ""
        const result = await shareService.getShareFiles(
          req.params.share,
          subPath
        )
        return Response.json({ ...result, path: `/${subPath}` })
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        return Response.json({ error: message }, { status: 404 })
      }
    },

    "/api/thumbnails/:id": (req: Request & { params: { id: string } }) => {
      const thumbnailId = req.params.id
      const thumbnailPath = shareService.getThumbnailPath(thumbnailId)

      if (!thumbnailPath) {
        return new Response("Thumbnail not found", { status: 404 })
      }

      return new Response(Bun.file(thumbnailPath), {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=31536000",
        },
      })
    },
  },

  fetch(req) {
    return new Response("Not Found", { status: 404 })
  },
})

process.on("SIGINT", async () => {
  console.log("SIGINT signal received. Shutting down...")
  await shareService.shutdown()
  process.exit(0)
})

console.log("MPV Remote Control Server running on http://localhost:3000")
console.log("Available shares: ", Object.keys(MEDIA_SHARES))

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
