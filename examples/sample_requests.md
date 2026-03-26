# Sample Requests

## Booking with contact details

```json
{
  "restaurant": "LAVO Italian Restaurant And Rooftop Bar",
  "rid": "lavo2011sg",
  "date": "2026-03-27",
  "time": "19:00",
  "adults": 2,
  "children": 0,
  "firstName": "Alice",
  "lastName": "Tan",
  "email": "alice@example.com",
  "mobile": "+6500000000",
  "specialRequest": "Window seat if possible",
  "promoCode": ""
}
```

## Booking without contact details

When contact details are omitted, the form-fill step is skipped and the flow proceeds directly to state detection.

```json
{
  "restaurant": "Original Greens",
  "rid": "originalgreens2505sg",
  "date": "2026-03-21",
  "time": "19:30",
  "adults": 2,
  "children": 0,
  "specialRequest": "Quiet corner if possible"
}
```

## Availability only

```json
{
  "restaurant": "Original Greens",
  "rid": "originalgreens2505sg",
  "date": "2026-03-21",
  "time": "19:30",
  "adults": 4,
  "children": 0,
  "availabilityOnly": true
}
```

## Booking with saved contact reuse

```json
{
  "restaurant": "Original Greens",
  "rid": "originalgreens2505sg",
  "date": "2026-03-21",
  "time": "19:30",
  "adults": 2,
  "children": 0,
  "userId": "user-123",
  "use_saved_contact": true
}
```

## Booking with specific profile

```json
{
  "restaurant": "Original Greens",
  "rid": "originalgreens2505sg",
  "date": "2026-03-21",
  "time": "19:30",
  "adults": 2,
  "children": 0,
  "userId": "user-123",
  "profile_id": "a1b2c3d4e5f67890"
}
```
