export interface RequestMessage<Payload> {
  msgId: number;
  payload: Payload;
}

export interface ResponseMessage<Payload> {
  msgId: number;
  payload?: Payload;
  error?: string;
}

export interface EventMessage<Payload> {
  payload: Payload;
}

/**
 * Determines if the given 'msg' is an EventMessage by checking if its 'msgId' property is undefined.
 * Returns true if the input message is of type EventMessage, otherwise false. This utility function can be used
 * to differentiate between instances of ResponseMessage and EventMessage that share a common Payload type.
 *
 * @param msg - The message object that can be either a ResponseMessage or EventMessage with a specific payload.
 * @returns A boolean value indicating whether the input message is an EventMessage (true) or not (false).
 */
export function isEventMessage<Payload>(
  msg: ResponseMessage<Payload> | EventMessage<Payload>,
): msg is EventMessage<Payload> {
  return (msg as ResponseMessage<Payload>).msgId === undefined;
}
