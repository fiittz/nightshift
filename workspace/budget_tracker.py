#!/usr/bin/env python3
"""
Simple Budget Tracker
Track expenses and generate reports
"""

import json
import csv
from datetime import datetime
from pathlib import Path

class BudgetTracker:
    def __init__(self, data_file="workspace/budget_data.json"):
        self.data_file = Path(data_file)
        self.data_file.parent.mkdir(exist_ok=True)
        self.load_data()
    
    def load_data(self):
        """Load existing budget data or initialize empty"""
        if self.data_file.exists():
            with open(self.data_file, 'r') as f:
                self.data = json.load(f)
        else:
            self.data = {
                "monthly_budget": 0.0,
                "expenses": [],
                "categories": ["Food", "Transportation", "Entertainment", "Utilities", "Other"]
            }
            self.save_data()
    
    def save_data(self):
        """Save data to JSON file"""
        with open(self.data_file, 'w') as f:
            json.dump(self.data, f, indent=2)
    
    def set_budget(self, amount):
        """Set monthly budget"""
        self.data["monthly_budget"] = float(amount)
        self.save_data()
        return f"Monthly budget set to ${amount:.2f}"
    
    def add_expense(self, amount, description, category=None):
        """Add a new expense"""
        if category and category not in self.data["categories"]:
            self.data["categories"].append(category)
        
        expense = {
            "id": len(self.data["expenses"]) + 1,
            "date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "amount": float(amount),
            "description": description,
            "category": category or "Other"
        }
        
        self.data["expenses"].append(expense)
        self.save_data()
        return f"Added expense: ${amount:.2f} for {description}"
    
    def get_expenses(self, category=None):
        """Get all expenses, optionally filtered by category"""
        if category:
            return [e for e in self.data["expenses"] if e["category"] == category]
        return self.data["expenses"]
    
    def get_total_expenses(self):
        """Calculate total expenses"""
        return sum(e["amount"] for e in self.data["expenses"])
    
    def get_remaining_budget(self):
        """Calculate remaining budget"""
        return self.data["monthly_budget"] - self.get_total_expenses()
    
    def generate_report(self, output_format="text"):
        """Generate budget report in specified format"""
        total_expenses = self.get_total_expenses()
        remaining = self.get_remaining_budget()
        
        # Calculate by category
        category_totals = {}
        for expense in self.data["expenses"]:
            cat = expense["category"]
            category_totals[cat] = category_totals.get(cat, 0) + expense["amount"]
        
        if output_format == "text":
            report = f"""
=== BUDGET REPORT ===
Generated: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}

Monthly Budget: ${self.data['monthly_budget']:.2f}
Total Expenses: ${total_expenses:.2f}
Remaining Budget: ${remaining:.2f}

Expenses by Category:
"""
            for category, amount in sorted(category_totals.items()):
                percentage = (amount / total_expenses * 100) if total_expenses > 0 else 0
                report += f"  {category}: ${amount:.2f} ({percentage:.1f}%)\n"
            
            report += f"\nTotal Expenses: {len(self.data['expenses'])} items"
            return report
        
        elif output_format == "csv":
            csv_file = "workspace/budget_report.csv"
            with open(csv_file, 'w', newline='') as f:
                writer = csv.writer(f)
                writer.writerow(["Category", "Amount", "Percentage"])
                for category, amount in sorted(category_totals.items()):
                    percentage = (amount / total_expenses * 100) if total_expenses > 0 else 0
                    writer.writerow([category, f"${amount:.2f}", f"{percentage:.1f}%"])
            
            return f"CSV report saved to {csv_file}"
        
        elif output_format == "json":
            json_file = "workspace/budget_report.json"
            report_data = {
                "generated": datetime.now().isoformat(),
                "monthly_budget": self.data['monthly_budget'],
                "total_expenses": total_expenses,
                "remaining_budget": remaining,
                "expenses_by_category": category_totals,
                "expense_count": len(self.data['expenses'])
            }
            
            with open(json_file, 'w') as f:
                json.dump(report_data, f, indent=2)
            
            return f"JSON report saved to {json_file}"
        
        else:
            return "Invalid output format. Use 'text', 'csv', or 'json'"
    
    def export_expenses(self, filename="workspace/expenses_export.csv"):
        """Export all expenses to CSV"""
        with open(filename, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(["ID", "Date", "Amount", "Description", "Category"])
            for expense in self.data["expenses"]:
                writer.writerow([
                    expense["id"],
                    expense["date"],
                    f"${expense['amount']:.2f}",
                    expense["description"],
                    expense["category"]
                ])
        return f"Expenses exported to {filename}"

def main():
    """Main function for command-line usage"""
    tracker = BudgetTracker()
    
    print("Budget Tracker - Command Line Interface")
    print("=" * 40)
    
    while True:
        print("\nOptions:")
        print("1. Set monthly budget")
        print("2. Add expense")
        print("3. View expenses")
        print("4. Generate report")
        print("5. Export expenses")
        print("6. Show summary")
        print("7. Exit")
        
        choice = input("\nEnter choice (1-7): ").strip()
        
        if choice == "1":
            try:
                amount = float(input("Enter monthly budget amount: $"))
                print(tracker.set_budget(amount))
            except ValueError:
                print("Invalid amount. Please enter a number.")
        
        elif choice == "2":
            try:
                amount = float(input("Enter expense amount: $"))
                description = input("Enter description: ").strip()
                print("Available categories:", ", ".join(tracker.data["categories"]))
                category = input("Enter category (press Enter for 'Other'): ").strip()
                if not category:
                    category = "Other"
                print(tracker.add_expense(amount, description, category))
            except ValueError:
                print("Invalid amount. Please enter a number.")
        
        elif choice == "3":
            expenses = tracker.get_expenses()
            if not expenses:
                print("No expenses recorded.")
            else:
                print(f"\nTotal Expenses: {len(expenses)} items")
                print("-" * 60)
                for expense in expenses:
                    print(f"{expense['id']}. {expense['date']} - ${expense['amount']:.2f}")
                    print(f"   {expense['description']} [{expense['category']}]")
                    print()
        
        elif choice == "4":
            print("Report formats: text, csv, json")
            fmt = input("Enter format (default: text): ").strip().lower()
            if not fmt:
                fmt = "text"
            print(tracker.generate_report(fmt))
        
        elif choice == "5":
            filename = input("Enter filename (default: workspace/expenses_export.csv): ").strip()
            if not filename:
                filename = "workspace/expenses_export.csv"
            print(tracker.export_expenses(filename))
        
        elif choice == "6":
            print(f"\nBudget Summary:")
            print(f"Monthly Budget: ${tracker.data['monthly_budget']:.2f}")
            print(f"Total Expenses: ${tracker.get_total_expenses():.2f}")
            print(f"Remaining Budget: ${tracker.get_remaining_budget():.2f}")
            print(f"Number of Expenses: {len(tracker.data['expenses'])}")
        
        elif choice == "7":
            print("Goodbye!")
            break
        
        else:
            print("Invalid choice. Please enter 1-7.")

if __name__ == "__main__":
    main()
