

/** ValidationService 
 * 
 * A valiation service is an interface that the validator client 
 * can register in order to perform some duties
 * 
 * Note(md): this interface is experimental - feel free to bin it if you dont like it
 * 
 */
export interface ValidationService {
    register(): void;
    start(): void;
    stop(): void;
}