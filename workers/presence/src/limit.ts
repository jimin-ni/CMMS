// 소켓마다 두는 토큰 버킷. 초당 rate 개가 차고 최대 burst 개까지 모인다.
// 메모리에만 있다. DO가 쉬면(hibernation) 사라지지만 쉬는 건 소켓이 조용할 때뿐이라 괜찮다.
export class Bucket {
  private tokens: number;
  private last: number | null = null;

  constructor(
    private readonly rate = 20,
    private readonly burst = 40,
  ) {
    this.tokens = burst;
  }

  take(nowMs: number): boolean {
    if (this.last !== null) {
      this.tokens = Math.min(this.burst, this.tokens + ((nowMs - this.last) / 1000) * this.rate);
    }
    this.last = nowMs;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
