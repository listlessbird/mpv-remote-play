import type {
  MPVCommand,
  MPVInstance,
  MPVResponse,
  RemoteCommand,
} from "./types"

class MPVManager {
  private instances = new Map<string, MPVInstance>()
  private requestCount = 0

  async createInstance(mediaFile?: string): Promise<string> {
    console.log(
      `[MPVManager] Creating new MPV instance${
        mediaFile ? ` with media file: ${mediaFile}` : ""
      }`
    )
    const id = crypto.randomUUID()
    const pipeName = `mpvsocket_${id}`
    const pipeAddress = `\\\\.\\pipe\\${pipeName}`
    console.log(
      `[MPVManager] Generated instance ID: ${id}, pipe name: ${pipeName}, pipe address: ${pipeAddress}`
    )

    const instance: MPVInstance = {
      id,
      pipeName,
      status: "starting",
      lastSeen: new Date(),
      process: null,
    }

    this.instances.set(id, instance)
    console.log(`[MPVManager] Instance ${id} added to instances map`)

    try {
      const args = [
        "--player-operation-mode=pseudo-gui",
        "--idle=yes",
        "--force-window=yes",
        "--input-ipc-server=" + pipeAddress,
      ]

      if (mediaFile) {
        args.push(mediaFile)
      }
      console.log(`[MPVManager] Starting MPV with args: ${args.join(" ")}`)

      const { $ } = await import("bun")

      //check if mpv actually exists or if the cmdline fails to run `mpv`
      try {
        const mpvVersion = await $`mpv --version`.text()
        console.log(`[MPVManager] MPV version:`, mpvVersion)
      } catch (error) {
        console.error(`[MPVManager] MPV not found:`, error)
        throw new Error("MPV binary not found")
      }
      console.log(`[MPVManager] Running MPV with args: ${args.join(" ")}`)
      const processPromise = $`mpv ${args}`.nothrow()
      console.log(`[MPVManager] MPV process started for instance ${id}`)

      instance.process = processPromise

      setImmediate(async () => {
        try {
          const result = await Promise.race([
            processPromise,
            new Promise((_, rej) =>
              setTimeout(() => rej(new Error("timeout")), 100)
            ),
          ])
        } catch (error) {
          if (error instanceof Error && error.message !== "timeout") {
            console.error("[MPVManager] process failed with: ", error)
          }
        }
      }, 50)

      await new Promise((resolve) => setTimeout(resolve, 2000))
      console.log(`[MPVManager] Waited 2 seconds for MPV to initialize`)

      try {
        await this.sendCommand(
          id,
          { command: ["get_property", "mpv-version"] },
          true
        )
        console.log(`[MPVManager] IPC connection successful for instance ${id}`)
        instance.status = "running"
      } catch (e) {
        console.error(
          `[MPVManager] IPC connection failed for instance ${id}:`,
          e
        )
        instance.status = "error"
        throw new Error("MPV started but IPC connection failed")
      }

      try {
        const quickCheck = await Promise.race([
          processPromise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("still running")), 100)
          ),
        ])
        console.log(`[MPVManager] Process already completed:`, quickCheck)
      } catch (checkError) {
        if (
          checkError instanceof Error &&
          checkError.message === "still running"
        ) {
          console.log(`[MPVManager] Process appears to still be running`)
        } else {
          console.error(`[MPVManager] Process check failed:`, checkError)
        }
      }

      processPromise
        .then((result) => {
          console.log(`[MPVManager] MPV process result:`, result)
          if (result.exitCode !== 0) {
            console.warn(
              `[MPVManager] MPV instance ${id} exited with code ${result.exitCode}`
            )
          } else {
            console.log(`[MPVManager] MPV instance ${id} exited normally`)
          }
          instance.status = "stopped"
        })
        .catch((error) => {
          console.error(
            `[MPVManager] Error starting MPV instance ${id}:`,
            error
          )
          instance.status = "error"
        })

      setTimeout(() => this.cleanDeadInstances(), 5000)
      console.log(
        `[MPVManager] Scheduled cleanup of dead instances in 5 seconds`
      )

      return id
    } catch (error) {
      console.error(`[MPVManager] Error starting MPV instance ${id}:`, error)
      instance.status = "error"
      throw error
    }
  }

  async sendCommand(
    instanceId: string,
    cmd: MPVCommand,
    allowStarting = false
  ) {
    console.log(`[MPVManager] Sending command to instance ${instanceId}:`, cmd)
    const instance = this.instances.get(instanceId)

    if (!instance) {
      console.error(`[MPVManager] MPV instance ${instanceId} not found`)
      throw new Error(`MPV instance ${instanceId} not found`)
    }

    const validStatuses = allowStarting ? ["running", "starting"] : ["running"]

    if (!validStatuses.includes(instance.status)) {
      console.error(
        `[MPVManager] MPV instance ${instanceId} status is ${
          instance.status
        }, expected ${validStatuses.join(" or ")}`
      )
      throw new Error(
        `MPV instance ${instanceId} not in valid state (${instance.status})`
      )
    }

    const net = await import("net")
    const pipeAddress = `\\\\.\\pipe\\${instance.pipeName}`
    console.log(`[MPVManager] Connecting to pipe: ${pipeAddress}`)

    return new Promise((resolve, reject) => {
      const socket = new net.Socket()
      const requestId = this.requestCount++
      const cmdWithId = { ...cmd, request_id: requestId }
      const cmdJson = JSON.stringify(cmdWithId) + "\n"
      console.log(
        `[MPVManager] Sending command with request ID ${requestId}: ${cmdJson.trim()}`
      )

      let response = ""

      socket.connect({ path: pipeAddress }, () => {
        console.log(`[MPVManager] Socket connected to pipe ${pipeAddress}`)
        socket.write(cmdJson)
      })

      socket.on("data", (data) => {
        response += data.toString()
        const lines = response.split("\n")
        console.log(
          `[MPVManager] Received data from pipe ${pipeAddress}: ${data
            .toString()
            .trim()}`
        )

        for (const line of lines) {
          if (line.trim()) {
            try {
              const res: MPVResponse = JSON.parse(line)
              console.log(`[MPVManager] Parsed response:`, res)

              if (res.request_id === requestId) {
                console.log(
                  `[MPVManager] Found matching response for request ID ${requestId}`
                )
                socket.end()
                resolve(res)
                return
              }
            } catch (error) {
              console.error(
                `[MPVManager] Error parsing response line: ${line}`,
                error
              )
            }
          }
        }
      })

      socket.on("error", (error) => {
        console.error(
          `[MPVManager] Socket error for instance ${instanceId}:`,
          error
        )
        socket.end()
        reject(error)
      })

      socket.setTimeout(5 * 1000, () => {
        console.error(`[MPVManager] Socket timeout for instance ${instanceId}`)
        socket.destroy()
        reject(new Error("Timeout waiting for response"))
      })
    })
  }

  async executeRemoteCommand(
    instanceId: string,
    remoteCmd: RemoteCommand
  ): Promise<any> {
    let mpvCommand: MPVCommand

    switch (remoteCmd.action) {
      case "play":
        mpvCommand = { command: ["cycle", "pause"] }
        break
      case "pause":
        mpvCommand = { command: ["cycle", "pause"] }
        break
      case "stop":
        mpvCommand = { command: ["stop"] }
        break
      case "seek":
        const seekTime = remoteCmd.params?.time || 0
        const seekType = remoteCmd.params?.type || "absolute"
        mpvCommand = { command: ["seek", seekTime, seekType] }
        break
      case "volume":
        const volume = remoteCmd.params?.level
        if (volume !== undefined) {
          mpvCommand = { command: ["set_property", "volume", volume] }
        } else {
          mpvCommand = { command: ["get_property", "volume"] }
        }
        break

      case "get_property":
        const property = remoteCmd.params?.property
        if (property) {
          mpvCommand = { command: ["get_property", property] }
        } else {
          throw new Error("Property is required for get_property command")
        }
        break

      case "set_property":
        const prop = remoteCmd.params?.property
        const value = remoteCmd.params?.value
        if (prop && value !== undefined) {
          mpvCommand = { command: ["set_property", prop, value] }
        } else {
          throw new Error(
            "Property and value are required for set_property command"
          )
        }
        break

      default:
        throw new Error(`Unknown Action: ${remoteCmd.action}`)
    }

    return await this.sendCommand(instanceId, mpvCommand)
  }

  private async getClientName(instanceId: string): Promise<string> {
    const instance = this.instances.get(instanceId)
    if (!instance) {
      throw new Error(`MPV instance ${instanceId} not found`)
    }
    const cmdResponse = await this.sendCommand(instanceId, {
      command: ["client_name"],
    })

    console.log(`[MPVManager] Client cmd response:`, cmdResponse)

    return (cmdResponse as MPVResponse)?.data as string
  }
  async getInstance(instanceId: string): Promise<MPVInstance | undefined> {
    console.log(`[MPVManager] Getting instance ${instanceId}`)
    const instance = this.instances.get(instanceId)
    if (instance) {
      try {
        const clientName = await this.getClientName(instanceId)
        console.log(`[MPVManager] Found instance ${instanceId}:`, {
          ...instance,
          clientName,
        })
        return { ...instance, clientName }
      } catch (error) {
        console.log(`[MPVManager] Found instance ${instanceId}:`, instance)
        return instance
      }
    } else {
      console.log(`[MPVManager] Instance ${instanceId} not found`)
    }
    return instance
  }

  async getAllInstances(): Promise<MPVInstance[]> {
    console.log(`[MPVManager] Getting all instances`)
    const instances = Array.from(this.instances.values())
    const instancesWithClientNames = await Promise.all(
      instances.map(async (instance) => {
        try {
          const clientName = await this.getClientName(instance.id)
          return { ...instance, clientName }
        } catch (error) {
          return instance
        }
      })
    )
    console.log(
      `[MPVManager] Found ${instances.length} instances:`,
      instancesWithClientNames
    )
    return instancesWithClientNames
  }

  async stopInstance(id: string): Promise<void> {
    console.log(`[MPVManager] Stopping instance ${id}`)
    const instance = this.instances.get(id)
    if (instance && instance.process) {
      try {
        console.log(`[MPVManager] Sending quit command to instance ${id}`)
        await this.sendCommand(id, { command: ["quit"] })
      } catch (e) {
        console.error(
          `[MPVManager] Error sending quit command to instance ${id}:`,
          e
        )
        // if IPC fails, force kill the process
        if (instance.process && typeof instance.process.kill === "function") {
          console.log(`[MPVManager] Force killing process for instance ${id}`)
          instance.process.kill()
        }
      }
      instance.status = "stopped"
      console.log(`[MPVManager] Instance ${id} stopped`)
    } else {
      console.log(`[MPVManager] Instance ${id} not found or has no process`)
    }
  }

  private cleanDeadInstances() {
    console.log(`[MPVManager] Cleaning dead instances`)
    const now = new Date()
    for (const [id, instance] of this.instances) {
      if (
        instance.status === "error" ||
        now.getTime() - instance.lastSeen.getTime() > 5 * 60 * 1000
      ) {
        console.log(`[MPVManager] Removing dead instance ${id}`)
        this.instances.delete(id)
      }
    }
    console.log(`[MPVManager] Cleanup complete`)
  }
}

export const mpvManager = new MPVManager()
