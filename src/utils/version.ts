
export class Version {
  private major_: number = 0;
  private minor_: number = 0;
  private patch_: number = 0;

  constructor(version?: string) {
    if (!version) {
      return;
    }

    const splitted = version.split(/[\.\- ]+/);
    if (splitted.length > 0) {
      this.major_ = Number.parseInt(splitted[0]);
    }
    if (splitted.length > 1) {
      this.minor_ = Number.parseInt(splitted[1]);
    }
    if (splitted.length > 2) {
      this.patch_ = Number.parseInt(splitted[2]);
    }
  }

  public isEqualTo(other: Version) {
    return this.major_ === other.major_ && this.minor_ === other.minor_ && this.patch_ === other.patch_;
  }

  public isGreaterThan(other: Version) {
    if (this.major_ > other.major_
      || this.major_ == other.major_ && this.minor_ > other.minor_
      || this.major_ == other.major_ && this.minor_ == other.minor_ && this.patch_ > other.patch_) {
      return true;
    }

    return false;
  }

  public toString() {
    return this.patch_ === 0 ? `${this.major_}.${this.minor_}` : `${this.major_}.${this.minor_}.${this.patch_}`;
  }
}