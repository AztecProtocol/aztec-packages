from typing import Optional


def modinv(a: int, modulus: int) -> Optional[int]:
    """Returns the modular inverse of a modulo modulus, if it exists."""
    if modulus <= 0:
        raise ValueError("Modulus must be positive")

    t, new_t = 0, 1
    r, new_r = modulus, a

    while new_r != 0:
        q = r // new_r
        t, new_t = new_t, t - q * new_t
        r, new_r = new_r, r - q * new_r

    if r > 1:
        return None
    if t < 0:
        t += modulus

    # Sanity check
    assert t * a % modulus == 1

    return t
