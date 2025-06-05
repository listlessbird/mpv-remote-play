import { mpvManager } from "./mpv-manager"

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
  },

  // (optional) fallback for unmatched routes:
  // Required if Bun's version < 1.2.3
  fetch(req) {
    return new Response("Not Found", { status: 404 })
  },
})

// fetch("http://localhost:3000/api/instances", {
//   method: "POST",
//   headers: {
//     "Content-Type": "application/json",
//   },
//   body: JSON.stringify({
//     mediaFile:
//       "E:\\dls\\Alien.Romulus.2024.1080p.AMZN.WEB-DL.DDP5.1.Atmos.H.264-FLUX.mkv",
//   }),
// })

fetch("http://localhost:3000/api/instances", {
  method: "GET",
  headers: {
    "Content-Type": "application/json",
  },
})
