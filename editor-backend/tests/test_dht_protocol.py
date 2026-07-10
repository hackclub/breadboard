from app.services.dht_protocol import build_payload


def test_dht11_uses_whole_value_bytes() -> None:
    assert build_payload('dht11', temperature=23, humidity=45) == [45, 0, 23, 0, 68]


def test_dht22_uses_tenths_based_bytes() -> None:
    assert build_payload('dht22', temperature=23, humidity=45) == [1, 194, 0, 230, 169]
