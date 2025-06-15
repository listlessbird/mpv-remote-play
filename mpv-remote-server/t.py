import asyncio


async def _check_ffmpeg_available() -> bool:
    try:
        result = await asyncio.create_subprocess_exec(
            "ffmpeg",
            "-version",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await result.communicate()
        return result.returncode == 0
    except FileNotFoundError:
        return False
    except Exception:
        return False


async def main():
    print(await _check_ffmpeg_available())
    # await run_command(["ffmpeg", "-version"])
    # await run_command(["ls", "-l"])
    # await run_command(["python", "-c", "print('hello world')"])
    # await run_command(["command_that_does_not_exist"])


async def run_command(command):
    proc = await asyncio.create_subprocess_exec(
        *command, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await proc.communicate()

    if stdout:
        print(f"Stdout:\n{stdout.decode()}")
    if stderr:
        print(f"Stderr:\n{stderr.decode()}")
    print(f"Return code: {proc.returncode}")


if __name__ == "__main__":
    asyncio.run(main())
