
export function sleep(ms = 5000): Promise<void> {
    return new Promise(rs => setTimeout(rs, ms));
}

export function random(min: number, max: number): number {
    return (Math.random() * (max - min)) + min;
}
