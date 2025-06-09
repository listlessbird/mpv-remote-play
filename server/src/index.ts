import { MEDIA_SHARES } from "./config"
import { mpvManager } from "./services/mpv-manager"
import type { RemoteCommand } from "./types"
import { MediaShare } from "./services/shares"

/**
 * TODO:
 *   - fix thumbnail url in file response, it should be /api/thumbnails/:id.jpg
 *      currently it is /api/thumbnails/default.jpg for all items
 */

const shareService = new MediaShare()
await shareService.init()

Bun.serve({
  routes: {
    "/api/status": () => {
      console.log("[ROUTE] GET /api/status")
      return Response.json({
        status: "OK",
        timestamp: new Date(),
        stats: shareService.getStats(),
      })
    },

    "/api/instances": {
      GET: async () => {
        console.log("[ROUTE] GET /api/instances")
        const instances = (await mpvManager.getAllInstances()).map((i) => ({
          id: i.id,
          status: i.status,
          lastSeen: i.lastSeen,
          clientName: i.clientName,
        }))
        return Response.json(instances)
      },

      POST: async (req) => {
        console.log("[ROUTE] POST /api/instances")
        try {
          const body = await req.json()
          const mediaFile = body?.mediaFile
          console.log("[ROUTE] Creating instance with media file:", mediaFile)
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
        console.log("[ROUTE] GET /api/instances/:id", req.params.id)
        const instance = mpvManager.getInstance(req.params.id)
        if (!instance) {
          return Response.json({ error: "Instance not found" }, { status: 404 })
        }
        return Response.json(instance)
      },

      DELETE: async (req) => {
        console.log("[ROUTE] DELETE /api/instances/:id", req.params.id)
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
        console.log("[ROUTE] POST /api/instances/:id/command", req.params.id)
        try {
          const command = (await req.json()) as RemoteCommand
          console.log("[ROUTE] Executing command:", command)
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
        console.log("[ROUTE] GET /api/shares")
        const shares = Object.keys(MEDIA_SHARES)
        console.log("[ROUTE] Available shares:", shares)
        return Response.json({
          shares,
        })
      },
    },
    "/api/shares/:share": {
      GET: async (req: Request & { params: { share: string } }) => {
        console.log("[ROUTE] GET /api/shares/:share", req.params.share)
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
      console.log(
        "[ROUTE] GET /api/shares/:share/:path",
        req.params.share,
        req.params.path
      )
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
      console.log("[ROUTE] GET /api/thumbnails/:id", req.params.id)
      let thumbnailId = req.params.id
      if (thumbnailId.endsWith(".jpg")) {
        thumbnailId = thumbnailId.replace(".jpg", "")
        console.log("[ROUTE] GET /api/thumbnails/:id", thumbnailId)
      }
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
    console.log("[ROUTE] Not Found:", req.url)
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
