#!/usr/bin/env python3
"""
Command Line Interface for Budget Tracker
"""

import sys
from budget_tracker import BudgetTracker

def main():
    tracker = BudgetTracker()
    
    if len(sys.argv) < 2:
        print_help()
        return
    
    command = sys.argv[1].lower()
    
    if command == "set-budget":
        if len(sys.argv) < 3:
            print("Usage: python cli.py set-budget <amount>")
            return
        amount = float(sys.argv[2])
        print(tracker.set_budget(amount))
    
    elif command == "add-expense":
        if len(sys.argv) < 4:
            print("Usage: python cli.py add-expense <amount> <description> [category]")
            return
        amount = float(sys.argv[2])
        description = sys.argv[3]
        category = sys.argv[4] if len(sys.argv) > 4 else None
        print(tracker.add_expense(amount, description, category))
    
    elif command == "show-expenses":
        category = sys.argv[2] if len(sys.argv) > 2 else None
        expenses = tracker.get_expenses(category)
        if not expenses:
            print(f"No expenses found{f' for category {category}' if category else ''}")
            return
        
        print(f"\nExpenses{f' for {category}' if category else ''}:")
        for exp in expenses:
            print(f"  {exp['date']} - ${exp['amount']:.2f} - {exp['description']} [{exp['category']}]")
        print(f"\nTotal: ${sum(e['amount'] for e in expenses):.2f}")
    
    elif command == "show-totals":
        print(f"Monthly Budget: ${tracker.data['monthly_budget']:.2f}")
        print(f"Total Expenses: ${tracker.get_total_expenses():.2f}")
        print(f"Remaining Budget: ${tracker.get_remaining_budget():.2f}")
    
    elif command == "generate-report":
        format_type = sys.argv[2] if len(sys.argv) > 2 else "text"
        if format_type not in ["text", "csv"]:
            print("Format must be 'text' or 'csv'")
            return
        
        if format_type == "text":
            print(tracker.generate_report("text"))
        else:
            tracker.generate_report("csv")
            print("CSV report generated at workspace/budget_report.csv")
    
    elif command == "help":
        print_help()
    
    else:
        print(f"Unknown command: {command}")
        print_help()

def print_help():
    help_text = """
Budget Tracker CLI - Manage your finances

Commands:
  set-budget <amount>          Set monthly budget
  add-expense <amount> <desc> [category]  Add new expense
  show-expenses [category]     List all expenses (optionally by category)
  show-totals                  Display budget totals
  generate-report [text|csv]   Generate report (default: text)
  help                         Show this help message

Examples:
  python cli.py set-budget 5000
  python cli.py add-expense 125.50 "Groceries" Food
  python cli.py show-expenses Food
  python cli.py generate-report csv
"""
    print(help_text)

if __name__ == "__main__":
    main()
