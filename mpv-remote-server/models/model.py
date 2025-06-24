from datetime import datetime
from enum import Enum
import struct
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List, Literal, Tuple


class MPVStatus(str, Enum):
    STARTING = "starting"
    RUNNING = "running"
    ERROR = "error"
    STOPPED = "stopped"


class MPVInstance(BaseModel):
    id: str
    pipe_name: str = Field(alias="pipeName")
    status: MPVStatus
    process: Optional[Any] = None
    last_seen: datetime = Field(alias="lastSeen")
    client_name: Optional[str] = Field(None, alias="clientName")

    class Config:
        populate_by_name = True


class MPVCommand(BaseModel):
    command: List[str]
    request_id: Optional[int] = Field(None, alias="request_id")
    async_: Optional[bool] = Field(None, alias="async")


class MPVResponse(BaseModel):
    error: str
    data: Optional[Any] = None
    request_id: Optional[int] = Field(None, alias="request_id")


class RemoteCommandAction(str, Enum):
    PLAY = "play"
    PAUSE = "pause"
    STOP = "stop"
    SEEK = "seek"
    LOADFILE = "loadfile"
    VOLUME = "volume"
    MUTE = "mute"
    GET_PROPERTY = "get_property"
    SET_PROPERTY = "set_property"


class RemoteCommand(BaseModel):
    action: RemoteCommandAction
    params: Optional[Dict[str, Any]] = None


class Track(BaseModel):
    id: str
    src: str
    title: str
    thumbnail: str
    duration: float
    playlist: Optional[str] = None


class ShareCache(BaseModel):
    files: Dict[str, Track]
    directories: List[str]
    last_scan: datetime = Field(alias="lastScan")

    class Config:
        populate_by_name = True


class CacheData(BaseModel):
    files: List[Tuple[str, Track]]
    directories: List[str]
    last_scan: str = Field(alias="lastScan")

    class Config:
        populate_by_name = True


class ThumbnailQueueItem(BaseModel):
    file_path: str = Field(alias="filePath")
    file_id: str = Field(alias="fileId")
    filename: str
    share_name: str = Field(alias="shareName")

    class Config:
        populate_by_name = True


class ShareScanResult(BaseModel):
    files: List[Track]
    directories: List[str]
    is_scanning: bool = Field(alias="isScanning")

    class Config:
        populate_by_name = True


class MediaStats(BaseModel):
    shares: int
    total_files: int = Field(alias="totalFiles")
    total_directories: int = Field(alias="totalDirectories")
    thumbnail_queue_size: int = Field(alias="thumbnailQueueSize")
    background_workers: int = Field(alias="backgroundWorkers")
    watchers: int

    class Config:
        populate_by_name = True


class MediaFile(BaseModel):
    id: str
    path: str
    filename: str
    share_name: str = Field(alias="shareName")
    size: int
    modified_at: datetime = Field(alias="modifiedAt")

    class Config:
        populate_by_name = True


class ScanResult(BaseModel):
    files: List[MediaFile]
    directories: List[str]
    is_scanning: bool = Field(alias="isScanning")

    class Config:
        populate_by_name = True


class ThumbnailResult(BaseModel):
    success: bool
    file_id: str = Field(alias="fileId")
    path: Optional[str] = None
    url: Optional[str] = None
    error: Optional[str] = None

    class Config:
        populate_by_name = True


class MPVAudioSubtitleTrack(BaseModel):
    id: str
    type: Optional[Literal["audio", "sub"]] = None
    title: Optional[str] = None
    selected: Optional[bool] = None
    codec: Optional[str] = None
    default: Optional[bool] = None
    lang: Optional[str] = None

    class Config:
        extra = "allow"


class AudioStreamConfig(BaseModel):
    sample_rate: int = 48000
    channels: int = 2
    bits_per_sample: int = 16
    chunk_ms: int = 20
    buffer_ms: int = 1000

    @property
    def bytes_per_sample(self) -> int:
        return self.bits_per_sample // 8

    @property
    def chunk_size(self) -> int:
        samples_per_chunk = (self.sample_rate * self.chunk_ms) // 1000
        return samples_per_chunk * self.bytes_per_sample * self.channels


class PCMChunk(BaseModel):
    ts_sec: int
    ts_usec: int
    size: int
    payload: bytes = Field(exclude=True)

    def to_wire_format(self) -> bytes:
        header = struct.pack("<IIQ", self.ts_sec, self.ts_usec, self.size)
        return header + self.payload

    @classmethod
    def from_wire_format(cls, data: bytes) -> "PCMChunk":
        ts_sec, ts_usec, size = struct.unpack("<IIQ", data[:16])
        payload = data[16 : 16 + size]
        return cls(ts_sec=ts_sec, ts_usec=ts_usec, size=size, payload=payload)


class AudioStream(BaseModel):
    config: AudioStreamConfig
    buffer: List[PCMChunk] = Field(default_factory=list)


class AudioSyncRequest(BaseModel):
    client_timestamp: float


class AudioSyncResponse(BaseModel):
    server_timestamp: float
    latency_correction: float
