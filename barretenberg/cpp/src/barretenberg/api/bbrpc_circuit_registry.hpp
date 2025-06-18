#pragma once
#include "barretenberg/api/bbrpc_common.hpp"
#include "barretenberg/ultra_honk/decider_proving_key.hpp"

namespace bb::bbrpc {
/**
 * @brief Type-erased base so BBRpcCircuitRegistry can iterate over all caches without knowing their
 *        template parameters.
 */
class BBRpcProvingKeyCacheBase {
  public:
    virtual ~BBRpcProvingKeyCacheBase() = default;

    /**
     * @brief Clears the cache of loaded proving keys.
     *
     * This function is registered to be called when the BBRpcProvingKeyCache is cleared.
     */
    virtual void clear() = 0;

    /**
     * @brief Drops a specific proving key from the cache.
     *
     * This function is registered to be called when a specific proving key is dropped.
     */
    virtual void drop(CircuitId circuit_id) = 0;
};

template <typename Flavor> class ProvingKeyEntry {
    /**
     * @brief Human-readable name for the circuit
     *
     * This name is not used for processing but serves as a debugging aid and
     * provides context for circuit identification in logs and diagnostics.
     */
    std::string name;

    /** Proving key for this flavor. */
    std::shared_ptr<DeciderProvingKey_<Flavor>> proving_key;
};

/* =================================================================================================
 *  PROVING-KEY CACHES
 * -------------------------------------------------------------------------------------------------
 *  These caches hold proving keys, one cache per "Flavor" (roughly, proving system variant).
 *  Because the key’s concrete type differs per flavor, the cache itself must have a type-erased base class
 *  (BBRpcProvingKeyCacheBase) and type-specific internally (BBRpcProvingKeyCache<Flavor>).
 * ================================================================================================= */

template <typename Flavor> class BBRpcProvingKeyCache : public BBRpcProvingKeyCacheBase {
  public:
    /* --------------------------------------------------------------------------
     *  Public helpers used via base class.
     * ---------------------------------------------------------------------- */

    /** This division by flavor is necessary to disambiguate proving key types. */
    void clear() override { proving_keys.clear(); }

    /** @brief Drops a specific proving key from the cache. */
    void drop(CircuitId circuit_id) override { proving_keys.erase(circuit_id); }

    /* --------------------------------------------------------------------------
     *  Public helpers used by BBRpcCircuitState via dynamic_cast.
     * ---------------------------------------------------------------------- */

    std::shared_ptr<DeciderProvingKey_<Flavor>> get(CircuitId id) const
    {
        auto it = proving_keys.find(id);
        return (it == proving_keys.end()) ? nullptr : it->second.proving_key;
    }

    void emplace(CircuitId id, ProvingKeyEntry<Flavor> entry) { proving_keys.emplace(id, std::move(entry)); }

  private:
    std::unordered_map<CircuitId, ProvingKeyEntry<Flavor>> proving_keys;
};

/** An unparsed circuit in the registry. */
struct CircuitEntry {
    /**
     * @brief Human-readable name for the circuit
     *
     * This name is not used for processing but serves as a debugging aid and
     * provides context for circuit identification in logs and diagnostics.
     */
    std::string name;

    /**
     * @brief Serialized bytecode representation of the circuit
     *
     * Contains the ACIR program in serialized form. The format (bincode or msgpack)
     * is determined by examining the first byte of the bytecode.
     */
    std::vector<uint8_t> bytecode;

    /**
     * @brief Serialized verification key for the circuit
     */
    std::vector<uint8_t> verification_key;
};

/* =================================================================================================
 *  CIRCUIT REGISTRY
 * -------------------------------------------------------------------------------------------------
 *  Owns:
 *    • The registry of circuits (bytecode + verification key + name).
 *    • A vector of proving-key caches, one per flavor (precisely, flavors used in this session).
 * ================================================================================================= */

class BBRpcCircuitRegistry {
  public:
    /* ---------------------------------------------------------------------------------------------
     *  House-keeping  (clear / drop)
     * ------------------------------------------------------------------------------------------ */

    /**
     * @brief Clears *everything* – circuits and proving keys for all flavors.
     *
     * Intended for tear-down at the end of a request or when resetting a long-running server.
     */
    void clear()
    {
        loaded_circuits.clear();
        for (auto& cache : proving_key_caches) {
            cache->clear();
        }
    }

    /**
     * @brief Remove exactly one circuit and its proving keys.
     *
     * Safe to call even if @p circuit_id was never registered.
     */
    void drop(CircuitId circuit_id)
    {
        loaded_circuits.erase(circuit_id);
        for (auto& cache : proving_key_caches) {
            cache->drop(circuit_id);
        }
    }

    /* --------------------------------------------------------------------------------------------- */
    /*  Registry helpers                                                                              */
    /* --------------------------------------------------------------------------------------------- */

    /** Registers a circuit definition (bytecode, VK, …). */
    void register_circuit(CircuitId id, CircuitEntry entry) { loaded_circuits.emplace(id, std::move(entry)); }

    /* --------------------------------------------------------------------------------------------- */
    /*  Proving-key retrieval                                                                         */
    /* --------------------------------------------------------------------------------------------- */

    /**
     * @brief Obtain (or lazily create) the proving key for the given circuit and flavor.
     *
     * Searches through our list of BBRpcProvingKeyCacheBase* for a cache of the correct Flavor,
     * returning the cached key when present; otherwise calls create_proving_key<Flavor>(…) and
     * stores the result before returning it.
     */
    template <typename Flavor> ProvingKeyEntry<Flavor> get_proving_key(CircuitId circuit_id)
    {
        /* 1) look for an existing cache entry ---------------------------------------------------- */
        BBRpcProvingKeyCache<Flavor>* typed_cache = nullptr;
        for (auto& cache : proving_key_caches) {
            typed_cache = dynamic_cast<BBRpcProvingKeyCache<Flavor>*>(cache.get());
            if (typed_cache) {
                if (auto pk = typed_cache->get(circuit_id)) {
                    return pk;
                }
                break; /* found the right cache type, but key not present */
            }
        }

        /* 2) construct the key ------------------------------------------------------------------- */
        auto circ = loaded_circuits.find(circuit_id);
        if (circ == loaded_circuits.end()) {
            throw std::runtime_error("Circuit not registered");
        }
        auto proving_key = create_proving_key<Flavor>(circ->second);

        /* 3) ensure we have a cache of the right flavor ------------------------------------------ */
        if (!typed_cache) {
            auto new_cache = std::make_unique<BBRpcProvingKeyCache<Flavor>>();
            typed_cache = new_cache.get();
            proving_key_caches.emplace_back(std::move(new_cache));
        }
        ProvingKeyEntry<Flavor> entry{ circ->second.name, proving_key };
        typed_cache->emplace(circuit_id, entry);
        return entry;
    }

  private:
    std::unordered_map<CircuitId, CircuitEntry> loaded_circuits;
    std::vector<std::unique_ptr<BBRpcProvingKeyCacheBase>> proving_key_caches;
};

} // namespace bb::bbrpc
