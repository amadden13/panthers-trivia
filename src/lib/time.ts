export function chicagoYMD(now = new Date()): string {
    // Convert "now" into a date string in America/Chicago
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(now); // en-CA yields YYYY-MM-DD
  }