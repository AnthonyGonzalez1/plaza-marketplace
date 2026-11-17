package com.plaza.store.shared;

import java.util.Map;

/**
 * The request is valid, but it cannot be done in the current state of the data (for example, the
 * stock ran out). Becomes a 409 Conflict. The properties are added to the problem detail so a
 * client can react to them without parsing the message.
 */
public class ConflictException extends RuntimeException {

    private final Map<String, Object> properties;

    public ConflictException(String message, Map<String, Object> properties) {
        super(message);
        this.properties = Map.copyOf(properties);
    }

    public Map<String, Object> getProperties() {
        return properties;
    }
}
