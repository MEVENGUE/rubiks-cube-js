declare module 'cubejs/lib/cube.js' {
  export default class Cube {
    constructor(other?: Cube)
    static fromString(str: string): Cube
    static inverse(algo: string): string
    static random(): Cube
    move(arg: string | number[]): this
    asString(): string
    identity(): this
    clone(): Cube
  }
}
