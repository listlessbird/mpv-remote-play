import { Event, useTrackPlayerEvents } from "react-native-track-player"

const events = [
  Event.PlaybackState,
  Event.PlaybackError,
  Event.PlaybackActiveTrackChanged,
]

export function useLogPlayerState() {
  useTrackPlayerEvents(events, async (e) => {
    if (e.type === Event.PlaybackError) {
      console.warn("An error occurred while playing the track: ", e)
    }

    if (e.type === Event.PlaybackState) {
      console.log("Playback state changed: ", e.state)
    }

    if (e.type === Event.PlaybackActiveTrackChanged) {
      console.log("Active track changed: ", e.track)
    }
  })
}
