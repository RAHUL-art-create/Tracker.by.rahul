---
name: personal-tracker
description: Manage the Personal Tracker app by chat - mark daily milk (1~MB / 2~MB bills), get milk bill totals, record student salary payments, see pending students, and add or check birthdays and anniversaries. Use whenever the user mentions milk, milk bill, salary, fees, students, birthdays, anniversaries or "my tracker".
---

# Personal Tracker

The `personal-tracker` MCP server edits the same data the app shows. Changes appear in the app the next time it is opened or brought back on screen.

## Picking the tool

| User says | Tool |
|---|---|
| "How is this month going?", "summary" | `get_overview` |
| "Mark today 1.5 litre", "yesterday no milk" | `mark_milk` (0 = nil) |
| "Mark 1st to 5th as 1 litre" | `mark_milk_range` |
| "What did I mark on the 12th?" | `get_milk_day` |
| "Milk bill for October", "bill from 1st to 15th" | `milk_bill_summary` |
| "Which days did I miss?" | `milk_unmarked_days` |
| "What are the milk prices?" | `list_milk_prices` |
| "1 litre is now 60 rupees" | `set_milk_price` (confirm first) |
| "Ravi paid 1000 today" | `add_salary` |
| "Who has not paid?", "salary total" | `salary_report` |
| "Add Priya's birthday on 12 March" | `add_event` |
| "Any birthdays this week?" | `list_events` with `days: 7` |
| "Done wishing Priya" | `set_event_celebrated` |
| Removing anything | `clear_milk_day`, `delete_salary`, `delete_event` (confirm first) |

## Rules

- Dates are India time. Pass `YYYY-MM-DD`, or `today` / `yesterday`.
- Milk quantities must match the saved price list. If a tool says a quantity has no price, tell the user and offer `set_milk_price`.
- In 2~MB mode there are two bills: `quantity` is Bill 1 and `quantity_bill2` is Bill 2. Check `list_milk_prices` for the mode if unsure.
- Salary is grouped by month name. "Pending" means paid last month but not yet this month.
- Ask before deleting anything or changing a price. Keep replies short and show money in rupees.
