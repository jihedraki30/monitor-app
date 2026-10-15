// src/app/models/audit-log.model.ts

export interface AuditLog {
  _id?:          string;
  time:          string;
  ip:            string;
  app?:          string;
  method:        string;
  uri:           string;
  status:        number;
  request_time:  number;
  bytes_sent?:   number;
  user_email:    string | null;
  role:          string;
  all_roles:     string[];
  has_token:     boolean;
  user_agent?:   string;
  parsed_at:     string;
}

export interface AuditStats {
  total:         number;
  withJwt:       number;
  anonymous:     number;
  errors:        number;
  uniqueUsers:   number;
  avgResponseMs: number;
}

export interface EndpointCount {
  uri:   string;
  count: number;
}

export interface HourlyCount {
  hour:  string;
  count: number;

}
export interface IpCount {
  ip: string;
  count: number;
  perMinute: number;        // avg requests / minute from this IP
}

export interface AppRate {
  app:       string;
  total:     number;
  periodSeconds: number;
  perMinute: number;
  perHour:   number;
  perDay:    number;
  uniqueIps:      number;   // distinct IPs seen for this app
  perDayPerIp:    number;   // avg requests / day made by ONE IP
}
