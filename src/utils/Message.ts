export class Message {
    readonly role: "user" | "assistant"
    readonly message: string
    constructor(
        role: "user" | "assistant",
        message: string
    ) {
        this.role = role,
            this.message = message
    }

    static assistant(message: string) {
        return new Message("assistant", message)
    }

    static user(message: string) {
        return new Message("user", message)
    }
}