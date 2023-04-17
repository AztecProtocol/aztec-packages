#pragma once

#include <stdlib/types/native_types.hpp>
#include <stdlib/types/circuit_types.hpp>

namespace aztec3::circuits::apps::notes {

using plonk::stdlib::types::CircuitTypes;
using plonk::stdlib::types::NativeTypes;

/**
 * Note: The methods in this interface must be implemented by the derived Note types, even if such note types don't
 * require such functions.
 *
 * It's essentially a visitor pattern. The Opcodes and UTXOStateVar types can call all of these
 * methods on any Note, and the Note must choose whether to compute something, or whether to throw, for each method.
 */
template <typename Composer> class NoteInterface {
  public:
    typedef CircuitTypes<Composer> CT;
    typedef typename CT::fr fr;
    typedef typename CT::grumpkin_point grumpkin_point;
    typedef typename CT::address address;
    typedef typename CT::boolean boolean;

    // Destructor explicitly made virtual, to ensure that the destructor of the derived class is called if the derived
    // object is deleted through a pointer to this base class. (In many places in the code, files handle
    // `NoteInterface*` pointers instead of the derived class).
    virtual ~NoteInterface() {}

    // TODO: maybe rather than have this be a pure interface, we should have a constructor and the `state_var*` and
    // `note_preimage` members here (although that would require a NotePreimage template param).
    // This is all because the Opcodes actually _assume_ a particular constructor layout for each Note, as well as
    // _assume_ those two data members are always present. Having said that, there's still no way to actually enforce a
    // constructor function data of a derived class.

    virtual void remove() = 0;

    virtual fr get_commitment() = 0;

    virtual fr get_nullifier() = 0;

    virtual fr get_initialisation_nullifier() = 0;

    virtual void constrain_against_advice(NoteInterface<Composer> const& advice_note) = 0;

    virtual bool needs_nonce() = 0;

    virtual void set_nonce(fr const& nonce) = 0;

    virtual fr generate_nonce() = 0;
};

} // namespace aztec3::circuits::apps::notes