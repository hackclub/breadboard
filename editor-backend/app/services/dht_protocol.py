"""DHT11 and DHT22 wire-format helpers."""
from __future__ import annotations


def build_payload(sensor_type: str, temperature: float, humidity: float) -> list[int]:
    """Return the five bytes sent by a DHT sensor, including its checksum."""
    if sensor_type == 'dht11':
        # A DHT11 reports whole values in separate integer/decimal bytes.
        hum = max(0, min(100, round(humidity)))
        temp = max(0, min(50, round(temperature)))
        return [hum, 0, temp, 0, (hum + temp) & 0xFF]

    # DHT22 reports humidity and temperature as 16-bit values in tenths.
    hum = round(humidity * 10)
    tmp = round(temperature * 10)
    hum_high, hum_low = (hum >> 8) & 0xFF, hum & 0xFF
    raw_temp = ((-tmp) & 0x7FFF) | 0x8000 if tmp < 0 else tmp & 0x7FFF
    temp_high, temp_low = (raw_temp >> 8) & 0xFF, raw_temp & 0xFF
    checksum = (hum_high + hum_low + temp_high + temp_low) & 0xFF
    return [hum_high, hum_low, temp_high, temp_low, checksum]
