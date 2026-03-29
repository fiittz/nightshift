#!/usr/bin/env python3
"""
Example usage of the Budget Tracker
"""

from budget_tracker import BudgetTracker

def run_example():
    print("=== Budget Tracker Example ===\n")
    
    # Create tracker
    tracker = BudgetTracker("workspace/example_budget.json")
    
    # Set monthly budget
    print("1. Setting monthly budget to $3000")
    print(tracker.set_budget(3000))
    print()
    
    # Add some expenses
    print("2. Adding expenses:")
    print(tracker.add_expense(45.50, "Groceries", "Food"))
    print(tracker.add_expense(25.00, "Gas", "Transportation"))
    print(tracker.add_expense(12.99, "Netflix subscription", "Entertainment"))
    print(tracker.add_expense(89.50, "Electric bill", "Utilities"))
    print(tracker.add_expense(15.75, "Coffee", "Food"))
    print()
    
    # Show summary
    print("3. Current Summary:")
    print(f"Monthly Budget: ${tracker.data['monthly_budget']:.2f}")
    print(f"Total Expenses: ${tracker.get_total_expenses():.2f}")
    print(f"Remaining Budget: ${tracker.get_remaining_budget():.2f}")
    print()
    
    # Generate text report
    print("4. Generating text report:")
    print(tracker.generate_report("text"))
    print()
    
    # Generate CSV report
    print("5. Generating CSV report:")
    print(tracker.generate_report("csv"))
    print()
    
    # Export expenses
    print("6. Exporting expenses:")
    print(tracker.export_expenses("workspace/example_expenses.csv"))
    print()
    
    print("=== Example Complete ===")
    print("Check workspace/ for generated files")

if __name__ == "__main__":
    run_example()
