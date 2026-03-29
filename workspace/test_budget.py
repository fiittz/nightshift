#!/usr/bin/env python3
"""
Test the Budget Tracker functionality
"""

from budget_tracker import BudgetTracker
import os

def test_budget_tracker():
    print("Testing Budget Tracker...")
    
    # Clean up any existing test data
    test_file = "test_budget_data.json"
    if os.path.exists(test_file):
        os.remove(test_file)
    
    # Create tracker with test file
    tracker = BudgetTracker(test_file)
    
    # Test 1: Set budget
    print("\n1. Setting monthly budget to $5000")
    result = tracker.set_budget(5000)
    print(f"   Result: {result}")
    
    # Test 2: Add expenses
    print("\n2. Adding sample expenses:")
    expenses = [
        (125.50, "Groceries", "Food"),
        (45.00, "Gas", "Transportation"),
        (89.99, "Netflix subscription", "Entertainment"),
        (150.00, "Electric bill", "Utilities"),
        (23.75, "Office supplies", "Other")
    ]
    
    for amount, desc, cat in expenses:
        result = tracker.add_expense(amount, desc, cat)
        print(f"   {result}")
    
    # Test 3: Get totals
    print(f"\n3. Total Expenses: ${tracker.get_total_expenses():.2f}")
    print(f"   Remaining Budget: ${tracker.get_remaining_budget():.2f}")
    
    # Test 4: Generate text report
    print("\n4. Generating text report:")
    report = tracker.generate_report("text")
    print(report)
    
    # Test 5: Generate CSV report
    print("\n5. Generating CSV report...")
    result = tracker.generate_report("csv")
    print(f"   CSV report generated at workspace/budget_report.csv")
    
    # Test 6: Filter expenses by category
    print(f"\n6. Food expenses:")
    food_expenses = tracker.get_expenses("Food")
    for exp in food_expenses:
        print(f"   - ${exp['amount']:.2f}: {exp['description']}")
    
    print("\n✅ All tests completed!")
    
    # Clean up test file
    if os.path.exists(test_file):
        os.remove(test_file)

if __name__ == "__main__":
    test_budget_tracker()
