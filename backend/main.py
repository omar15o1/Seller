# استيراد مكتبات
from fastapi import FastAPI, Depends, HTTPException, status, Header
from fastapi.responses import Response, StreamingResponse
from fastapi.security import OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, DateTime, ForeignKey, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from passlib.context import CryptContext
from jose import jwt
from datetime import datetime, timedelta, timezone
import joblib
import numpy as np
import pandas as pd
from pathlib import Path
from io import BytesIO
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
   
# اعدادات التوكين
SECRET_KEY = "SUPER_SECRET_KEY_FOR_PROD"  
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 # مده صلاحيه التوكين

# اعدادات قاعده البيانات
DATABASE_URL = "sqlite:///./car_app.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()

# جدول المستخدمين
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    password = Column(String)
 
#جدول التوقعات
class Prediction(Base):
    __tablename__ = "predictions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    manufacturer = Column(String)
    model_name = Column(String)
    predicted_price = Column(Integer)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

Base.metadata.create_all(bind=engine) # انشاء قاعده لو مش موجوده

# =================== SECURITY & CORS ===================
app = FastAPI(title="selery api")

# تفعيل الـ CORS للسماح للـ Frontend بالاتصال بالـ API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # حط عنوان الموقع هنا بدل النجمه "*" 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto") #تشفير كلمه السر
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login") # تطبيق النظام 

#داله تشفير
def hash_password(password: str): return pwd_context.hash(password)
#داله فك التشفير والمقارنه
def verify_password(password, hashed): return pwd_context.verify(password, hashed)

#داله انشاء توكن بالاسم والصلاحيه
def create_token(username: str):
    payload = {
        "sub": username,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

# تحميل الموديل والـ encoders (مسارات relative لملف main.py)
model = None
encoders = None
try:
    _BASE_DIR = Path(__file__).resolve().parent
    model = joblib.load(str(_BASE_DIR / "cars_predictions.joblib"))
    encoders = joblib.load(str(_BASE_DIR / "encoders.joblib"))
except Exception as e:
    print(f"Error loading model files: {e}")

# نعريف الاسكيما
class UserAuth(BaseModel):
    username: str
    password: str
#بيانات السياره
class CarInput(BaseModel):
    Manufacturer: str; Model: str; Category: str; Fuel_type: str
    Gear_box_type: str; Drive_wheels: str; Wheel: str; Color: str
    Engine_volume: float; Mileage: int; Levy: int; Cylinders: int; Airbags: int; age: int

# داله لغانشاء الجلسه 
def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

#تحديد الخطأ  بدل ما تكون عامه ال except
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token payload")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Could not validate credentials")
    
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user

# Optional auth: allow the app to work without requiring login.
# If the Authorization header is missing/invalid, we return None and treat the request as anonymous.
def get_optional_current_user(
    authorization: str = Header(None),
    db: Session = Depends(get_db),
):
    if not authorization:
        return None

    token = authorization
    if isinstance(authorization, str) and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1]

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if not username:
            return None
    except:
        return None

    user = db.query(User).filter(User.username == username).first()
    return user
# صفحه تسجيل مستخدم جديد
@app.post("/register")
def register(user: UserAuth, db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == user.username).first():
        raise HTTPException(status_code=400, detail="Username already taken")
    new_user = User(username=user.username, password=hash_password(user.password))
    db.add(new_user); db.commit()
 
    return {"status": "success", "message": "Account created successfully"}

#صفحه  الدخول وارجاع التوكن
@app.post("/login")
def login(user: UserAuth, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user.username).first()
    if not db_user or not verify_password(user.password, db_user.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"access_token": create_token(db_user.username), "token_type": "bearer"}

# صفحه التوقع
@app.post("/predict")
def predict(data: CarInput, current_user: User = Depends(get_optional_current_user), db: Session = Depends(get_db)):
    if model is None or encoders is None:
        raise HTTPException(
            status_code=500,
            detail="Model files not loaded. Put cars_predictions.joblib and encoders.joblib inside backend/ then restart the server.",
        )
    input_dict = data.dict()
    feature_columns = ['Manufacturer', 'Model', 'Category', 'Fuel_type', 
                       'Gear_box_type', 'Drive_wheels', 'Wheel', 'Color', 
                       'Engine_volume', 'Mileage', 'Levy', 'Cylinders', 'Airbags', 'age']

    def normalize_to_encoder(col: str, val):
        if col not in encoders:
            return val
        if val is None:
            return val
        s = str(val).strip()
        if not s:
            return s

        if col == "Drive_wheels" and s.upper() == "4X4":
            s = "4x4"
        if col == "Wheel":
            if s.lower() == "left":
                s = "Left wheel"
            elif s.lower() == "right":
                s = "Right wheel"

        try:
            classes = list(encoders[col].classes_)
        except Exception:
            return s

        if s in classes:
            return s

        s_lower = s.casefold()
        for c in classes:
            if str(c).casefold() == s_lower:
                return c

        return s
    
    processed = []
    for col in feature_columns:
        val = normalize_to_encoder(col, input_dict[col])
        if col in encoders:
            try:
                val = encoders[col].transform([val])[0]
            except:
                # لو الانكودر مش موجود 
                val = encoders[col].transform([encoders[col].classes_[0]])[0]
        processed.append(val)
    
    X_input = np.array(processed).reshape(1, -1) #تحويل البيانات لمصفوفه
    prediction = model.predict(X_input)[0] #التوقع

    # حساب نسبه الثقه بناء علي الموديل
    try:
        leaf_index = model.apply(X_input)[0]
        confidence = model.tree_.n_node_samples[leaf_index] / model.tree_.n_node_samples[0]
    except:
        confidence = 0.85 # قيمة افتراضية لو مفيش نسبه

    new_pred = Prediction(
        user_id=current_user.id if current_user else None,
        manufacturer=data.Manufacturer,
        model_name=data.Model,
        predicted_price=int(prediction)
    )
    db.add(new_pred); db.commit(); db.refresh(new_pred)


    return {
        "status": "success",
        "data": {
            "prediction_id": new_pred.id,
            "price": int(prediction),
            "confidence": round(confidence * 100, 2)
        }
    }

# صفحه اجمالي التوقعات ومتوسط الاسعار
@app.get("/dashboard/metadata")
def get_dashboard_metadata(current_user: User = Depends(get_optional_current_user), db: Session = Depends(get_db)):
    query = db.query(Prediction)
    if current_user:
        query = query.filter(Prediction.user_id == current_user.id)
    all_records = query.all()
    total = len(all_records)
    avg_price = sum([r.predicted_price for r in all_records]) / total if total else 0
    
    # تحضير بيانات الرسم البياني (آخر 15 عملية)
    chart_records = all_records[-15:]
    
    return {
        "status": "success",
        "data": {
            "user": current_user.username if current_user else "anonymous",
            "stats": {
                "total_predictions": total,
                "average_price": round(avg_price, 2)
            },
            "chart": {
                "labels": [r.created_at.strftime("%b %d") for r in chart_records],
                "prices": [r.predicted_price for r in chart_records],
                "names": [f"{r.manufacturer} {r.model_name}" for r in chart_records]
            }
        }
    }

# تصدير الي pdf باستخدام  الai
@app.get("/prediction/{pred_id}/pdf")
def generate_pdf(pred_id: int, current_user: User = Depends(get_optional_current_user), db: Session = Depends(get_db)):
    query = db.query(Prediction).filter(Prediction.id == pred_id)
    if current_user:
        query = query.filter(Prediction.user_id == current_user.id)

    res = query.first()
    if not res: raise HTTPException(status_code=404, detail="Not Found")
    buffer = BytesIO()
    p = canvas.Canvas(buffer, pagesize=letter)
    p.setFillColorRGB(0.1, 0.2, 0.4)
    p.rect(0, 750, 700, 100, fill=1)
    p.setFillColorRGB(1, 1, 1)
    p.setFont("Helvetica-Bold", 24)
    p.drawString(50, 775, "CAR VALUATION REPORT")
    p.setFillColorRGB(0, 0, 0)
    p.setFont("Helvetica", 12)
    p.drawString(50, 700, f"Vehicle: {res.manufacturer} {res.model_name}")
    p.drawString(50, 680, f"Report ID: #{res.id}")
    p.drawString(50, 660, f"Generated for: {current_user.username if current_user else 'anonymous'}")
    p.drawString(50, 640, f"Date: {res.created_at.strftime('%Y-%m-%d')}")
    p.setStrokeColorRGB(0.2, 0.5, 0.8)
    p.roundRect(50, 540, 500, 70, 10, stroke=1, fill=0)
    p.setFont("Helvetica-Bold", 18)
    p.drawCentredString(300, 570, f"ESTIMATED MARKET PRICE: ${res.predicted_price:,}")
    p.showPage(); p.save()
    pdf = buffer.getvalue(); buffer.close()
    return Response(content=pdf, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=Report_{pred_id}.pdf"})

# excel صفحه تصدير
@app.get("/dashboard/export-excel")
def export_excel(current_user: User = Depends(get_optional_current_user), db: Session = Depends(get_db)):
    query = db.query(Prediction)
    if current_user:
        query = query.filter(Prediction.user_id == current_user.id)
    records = query.all()
    if not records: raise HTTPException(status_code=404, detail="No data")
    data = [{"ID": r.id, "Car": f"{r.manufacturer} {r.model_name}", "Price": r.predicted_price, "Date": r.created_at} for r in records]
    df = pd.DataFrame(data)
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False)
    output.seek(0)    
    return StreamingResponse(output, media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={"Content-Disposition": f"attachment; filename=Predictions_Export.xlsx"})
